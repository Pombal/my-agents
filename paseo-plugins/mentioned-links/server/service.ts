import type { PaseoApi } from "@getpaseo/client";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { linksForAgent } from "../shared/links";
import { TailFold } from "./cache";
import { addProse, listLinks, siteFor, type LinkMap } from "./links";
import { findTranscript } from "./transcripts";

/**
 * `links.for-agent`. omp/claude/codex chats are read from their transcript (only the appended
 * bytes after the first request). Other providers use the daemon timeline: the client asks only
 * for chats on screen, which the daemon already has loaded, so the fetch never resumes an agent.
 */
export function createLinksService(home: string) {
  const site = siteFor(home);
  const transcripts = new TailFold<LinkMap>(() => new Map());

  return async function forAgent(
    { agentId }: RpcInput<typeof linksForAgent>,
    paseo: PaseoApi,
  ): Promise<RpcOutput<typeof linksForAgent>> {
    const handle = paseo.agents.ref(agentId);
    // fetch_agent reads the live or stored record; unlike a timeline fetch it never loads the agent.
    const agent = (await handle.refresh())?.agent;
    if (!agent) return { source: "none", links: [] };
    const transcript = await findTranscript(agent, home);
    if (transcript) {
      try {
        const links = await transcripts.read(transcript.file, (acc, line) => {
          const prose = transcript.read(line);
          if (prose) addProse(acc, prose, site);
        });
        return { source: "transcript", links: listLinks(links) };
      } catch (error) {
        console.warn(`[mentioned-links] reading ${transcript.file} failed; using the timeline`, error);
      }
    }
    const page = await handle.timeline.refetch({ direction: "tail", limit: 0 });
    const links: LinkMap = new Map();
    for (const { item, timestamp } of page.entries) {
      if (item.type !== "user_message" && item.type !== "assistant_message") continue;
      addProse(links, { role: item.type === "user_message" ? "user" : "assistant", text: item.text, at: Date.parse(timestamp) }, site);
    }
    return { source: "timeline", links: listLinks(links) };
  };
}
