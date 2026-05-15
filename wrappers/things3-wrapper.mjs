#!/usr/bin/env node
// Wraps things3-mcp to fix its response format: the package returns
// { toolResult: [...] } (old MCP draft) instead of { content: [...] }.
// This proxy intercepts stdout and converts to the v1 content format.
import { spawn } from 'child_process';
import { createInterface } from 'readline';

const child = spawn('npx', ['-y', 'things3-mcp@latest'], {
  env: process.env,
  stdio: ['pipe', 'pipe', 'inherit'],
});

process.stdin.pipe(child.stdin);

const rl = createInterface({ input: child.stdout });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    process.stdout.write(line + '\n');
    return;
  }

  if (
    msg.result &&
    msg.result.toolResult !== undefined &&
    Array.isArray(msg.result.content) &&
    msg.result.content.length === 0
  ) {
    msg.result.content = [{ type: 'text', text: JSON.stringify(msg.result.toolResult) }];
    delete msg.result.toolResult;
  }

  process.stdout.write(JSON.stringify(msg) + '\n');
});

child.on('exit', (code) => process.exit(code ?? 0));
