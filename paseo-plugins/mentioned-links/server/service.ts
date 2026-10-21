import type { PaseoApi } from "@getpaseo/client";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { linksForAgent } from "../shared/links";
import { TailFold } from "./cache";
import { addProse, listLinks, siteFor, subagentLinks, type LinkMap } from "./links";
import { findSubagents } from "./subagents";
import { findTranscript, type ProseReader } from "./transcripts";

/** Sub-agent transcripts read at once; a session can have hundreds. */
const SUBAGENT_BATCH = 16;

/**
 * `links.for-agent`. omp/claude/codex chats are read from their transcript (only the appended
 * bytes after the first request). Other providers use the daemon timeline: the client asks only
 * for chats on screen, which the daemon already has loaded, so the fetch never resumes an agent.
 * Sub-agents are read from their transcripts only, never through the timeline.
 */
export function createLinksService(home: string) {
  const site = siteFor(home);
  const transcripts = new TailFold<LinkMap>(() => new Map());
  const fold = (file: string, read: ProseReader) =>
    transcripts.read(file, (acc, line) => {
      const prose = read(line);
      if (prose) addProse(acc, prose, site);
    });

  return async function forAgent(
    { agentId, subagents }: RpcInput<typeof linksForAgent>,
    paseo: PaseoApi,
  ): Promise<RpcOutput<typeof linksForAgent>> {
    const handle = paseo.agents.ref(agentId);
    // fetch_agent reads the live or stored record; unlike a timeline fetch it never loads the agent.
    const agent = (await handle.refresh())?.agent;
    if (!agent) return { source: "none", links: [] };
    const transcript = await findTranscript(agent, home);
    let source: "transcript" | "timeline" = "transcript";
    let links: LinkMap | null = null;
    if (transcript) {
      try {
        links = await fold(transcript.file, transcript.read);
      } catch (error) {
        console.warn(`[mentioned-links] reading ${transcript.file} failed; using the timeline`, error);
      }
    }
    if (!links) {
      source = "timeline";
      links = new Map();
      const page = await handle.timeline.refetch({ direction: "tail", limit: 0 });
      for (const { item, timestamp } of page.entries) {
        if (item.type !== "user_message" && item.type !== "assistant_message") continue;
        addProse(links, { role: item.type === "user_message" ? "user" : "assistant", text: item.text, at: Date.parse(timestamp) }, site);
      }
    }
    if (!subagents) return { source, links: listLinks(links) };

    const found = await findSubagents(agentId, transcript, paseo, home);
    const read: { name: string; links: LinkMap }[] = [];
    for (let start = 0; start < found.length; start += SUBAGENT_BATCH) {
      const batch = found.slice(start, start + SUBAGENT_BATCH);
      const folded = await Promise.all(batch.map(({ file, read: reader }) => fold(file, reader).catch(() => null)));
      batch.forEach(({ name }, index) => {
        const subLinks = folded[index];
        if (subLinks) read.push({ name, links: subLinks });
      });
    }
    return { source, links: listLinks(links), subagentLinks: subagentLinks(links, read) };
  };
}
