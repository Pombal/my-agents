import type { PluginClientContext } from "@getpaseo/plugin/client";

// Send through the public API rather than resubmitting the composer: /follow-up bypasses
// Paseo's busy-agent cancellation, and cannot recurse into these client commands.
export default function contribute(client: PluginClientContext) {
  const cleanups = ([
    ["tan", "OMP: run a background tangent (without interrupting)", "<work>"],
    ["omfg", "OMP: turn a correction into a persistent rule", "<correction>"],
    ["queue", "OMP: queue a message after the current turn", "<message>"],
  ] as const).map(([name, description, argumentHint]) =>
    client.addSlashCommand({
      name,
      description,
      argumentHint,
      context: "agent",
      async onSubmit({ args, agent, paseo }) {
        const original = `/${name}${args ? ` ${args}` : ""}`;
        // Plugin commands win provider collisions. Preserve non-OMP provider behavior by
        // forwarding the original command unchanged, never rewriting it to /follow-up.
        const isOmp = agent.provider === "omp";
        if (isOmp && !args) throw new Error(`Usage: /${name} ${argumentHint}`);
        const text = isOmp
          ? `/follow-up ${name === "queue" ? args : original}`
          : original;
        await paseo.agents.ref(agent.id).send(text);
      },
    }),
  );
  return () => cleanups.forEach(cleanup => cleanup());
}
