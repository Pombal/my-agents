Fixture for chat-diff-highlight. Plain prose with `inline code` and **bold** stays native.

1. A labeled diff with file headers (TypeScript):

```diff
--- a/src/lib/greet.ts
+++ b/src/lib/greet.ts
@@ -1,7 +1,8 @@ export function greet
 import { log } from "./log";
 
-export function greet(name: string) {
-  return "Hello " + name; // old
+export function greet(name: string, excited = false): string {
+  const suffix = excited ? "!" : ".";
+  return `Hello ${name}${suffix}`; // new
 }
 
 const MAX_RETRIES = 3;
```

2. A labeled mock diff without headers:

```diff
- const useMockData = process.env.USE_MODEL_MOCK_DATA === "true" || !isProduction;
+ const useMockData = process.env.USE_MODEL_MOCK_DATA === "true";
```

3. An unlabeled diff with a hunk header (Python):

```
diff --git a/tools/run.py b/tools/run.py
--- a/tools/run.py
+++ b/tools/run.py
@@ -10,4 +10,5 @@ def main():
     args = parse()
-    if args.verbose == True:
+    # verbose flag is a bool
+    if args.verbose:
         print("running", len(args.items))
```

4. An unlabeled +/- block:

```
-    ...baseConfig.transform,
     "^.+\\.rbxmx$": transformer,
+    "^.+\\.md$": markdownTransformer,
```

5. Normal code blocks must stay as they are:

```ts
const total = items.reduce((sum, item) => sum + item.price, 0);
```

```
-skills   [invoked skill: dry-dev]           + your prompt
default   [invoked skill: dry-dev — trimmed] + your prompt
```

- A normal list item
- Another one
