import type { PluginTheme } from "@getpaseo/plugin";
import { openExternalUrl } from "@getpaseo/plugin/client";
import { ScrollView } from "@getpaseo/plugin/client/react-native";
import { useMemo } from "react";
import { Platform, StyleSheet, Text, type TextStyle, View } from "react-native";
import { type Block, parseMarkdown, type Span } from "./markdown";

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });
const HEADING_SIZE = [20, 18, 16, 15, 14, 14];

function Spans({ spans, theme }: { spans: Span[]; theme: PluginTheme }) {
  return spans.map((span, index) => {
    const style: TextStyle = {
      ...(span.bold ? { fontWeight: "600" } : {}),
      ...(span.italic ? { fontStyle: "italic" } : {}),
      ...(span.strike ? { textDecorationLine: "line-through" } : {}),
      ...(span.code
        ? { fontFamily: MONO, fontSize: 13, backgroundColor: theme.colors.surface2, color: theme.colors.foreground }
        : {}),
      ...(span.url ? { color: theme.colors.accent, textDecorationLine: "underline" } : {}),
    };
    const url = span.url;
    return (
      <Text key={index} style={style} onPress={url ? () => void openExternalUrl(url) : undefined}>
        {span.text}
      </Text>
    );
  });
}

function BlockView({ block, theme }: { block: Block; theme: PluginTheme }) {
  const text = { color: theme.colors.foreground, fontSize: 14, lineHeight: 21 };
  switch (block.type) {
    case "heading":
      return (
        <Text selectable style={[text, { fontSize: HEADING_SIZE[block.level - 1], fontWeight: "600", lineHeight: undefined }]}>
          <Spans spans={block.spans} theme={theme} />
        </Text>
      );
    case "paragraph":
      return (
        <Text selectable style={text}>
          <Spans spans={block.spans} theme={theme} />
        </Text>
      );
    case "item":
      return (
        <View style={[styles.item, { paddingLeft: block.depth * 16 }]}>
          <Text style={[text, styles.marker, { color: theme.colors.foregroundMuted }]}>{block.marker}</Text>
          <Text selectable style={[text, styles.flex]}>
            <Spans spans={block.spans} theme={theme} />
          </Text>
        </View>
      );
    case "quote":
      return (
        <View style={[styles.quote, { borderLeftColor: theme.colors.border }]}>
          <Text selectable style={[text, { color: theme.colors.foregroundMuted }]}>
            <Spans spans={block.spans} theme={theme} />
          </Text>
        </View>
      );
    case "code":
      return (
        <ScrollView horizontal style={[styles.code, { backgroundColor: theme.colors.surface2 }]}>
          <Text selectable style={{ color: theme.colors.foreground, fontFamily: MONO, fontSize: 13, lineHeight: 19 }}>
            {block.text}
          </Text>
        </ScrollView>
      );
    case "table":
      return (
        <ScrollView horizontal>
          <View style={[styles.table, { borderColor: theme.colors.border }]}>
            {[block.header, ...block.rows].map((row, rowIndex) => (
              <View
                key={rowIndex}
                style={[styles.row, rowIndex > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.colors.border }]}
              >
                {row.map((cell, cellIndex) => (
                  <Text key={cellIndex} selectable style={[text, styles.cell, rowIndex === 0 && { fontWeight: "600" }]}>
                    <Spans spans={cell} theme={theme} />
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    case "rule":
      return <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />;
  }
}

/** Renders model-answer Markdown with React Native text (all Paseo clients). */
export function MarkdownView({ source, theme }: { source: string; theme: PluginTheme }) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} theme={theme} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: 8 },
  item: { flexDirection: "row", gap: 6 },
  marker: { minWidth: 14 },
  flex: { flex: 1 },
  quote: { borderLeftWidth: 3, paddingLeft: 10 },
  code: { borderRadius: 6, padding: 10, flexGrow: 0 },
  table: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6 },
  row: { flexDirection: "row" },
  cell: { minWidth: 90, maxWidth: 260, paddingHorizontal: 8, paddingVertical: 4 },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
});
