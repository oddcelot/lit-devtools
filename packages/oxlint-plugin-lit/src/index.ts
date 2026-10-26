/**
 * An Oxlint plugin reporting what the Lit language server reports, so a lint
 * run fails on the problems the editor shows:
 *
 * ```ts
 * import {defineConfig} from 'oxlint';
 * import litDevtools from '@oddsquad/oxlint-plugin-lit';
 *
 * export default defineConfig({extends: [litDevtools.configs.recommended]});
 * ```
 *
 * Lint rules are synchronous and the workspace is read asynchronously, so a
 * worker keeps the workspace and each file waits on it once, whichever rules
 * are on.
 */

import {fileURLToPath} from 'node:url';
import {
  MessageChannel,
  type MessagePort,
  Worker,
  receiveMessageOnPort,
} from 'node:worker_threads';
import {
  DEFAULT_SEVERITIES,
  DIAGNOSTIC_RULES,
  type DiagnosticRule,
  type Severity,
} from '../../../src/lib/editor/config.js';
import type {Problem} from '../../../src/lib/editor/diagnostics.js';

/** What the plugin sends its worker (`worker.ts`) for each file. */
export interface CheckMessage {
  file: string;
  code: string;
  port: MessagePort;
  /** Set to 1 and notified once the answer is on the port. */
  signal: Int32Array;
}

/** How long one file may take, which includes reading the workspace. */
const TIMEOUT_MS = 120_000;

let worker: Worker | undefined;

const workerOf = (): Worker => {
  if (!worker) {
    worker = new Worker(new URL('./worker.mjs', import.meta.url));
    worker.unref();
  }
  return worker;
};

type Answer = {problems: Problem[]} | {error: string};

/** Posts the file to the worker and blocks until it answers. */
const askWorker = (file: string, code: string): Answer | undefined => {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const {port1, port2} = new MessageChannel();
  const message: CheckMessage = {file, code, port: port2, signal};
  workerOf().postMessage(message, [port2]);
  Atomics.wait(signal, 0, 0, TIMEOUT_MS);
  const answer = receiveMessageOnPort(port1)?.message as Answer | undefined;
  port1.close();
  return answer;
};

const problemsFromWorker = (file: string, code: string): Problem[] => {
  const answer = askWorker(file, code) ?? {
    error: `checking ${file} took over ${TIMEOUT_MS / 1000}s`,
  };
  if ('error' in answer) throw new Error(`Lit: ${answer.error}`);
  return answer.problems;
};

/** The last file's problems, which every rule on it reads. */
let last: {file: string; code: string; problems: Problem[]} | undefined;

const problemsOf = (file: string, code: string): Problem[] => {
  if (last?.file !== file || last.code !== code) {
    last = {file, code, problems: problemsFromWorker(file, code)};
  }
  return last.problems;
};

/** The parts of the rule context the rules use (ESLint's API, which Oxlint keeps). */
interface RuleContext {
  filename: string;
  sourceCode: {
    text: string;
    getLocFromIndex(index: number): {line: number; column: number};
  };
  report(descriptor: {
    message: string;
    loc: {
      start: {line: number; column: number};
      end: {line: number; column: number};
    };
    fix?: (fixer: Fixer) => unknown;
  }): void;
}

interface Fixer {
  replaceTextRange(range: [number, number], text: string): unknown;
}

const DESCRIPTIONS: Record<DiagnosticRule, string> = {
  'unknown-element': 'An element no component or HTML defines.',
  'unknown-attribute': "An attribute the element doesn't have.",
  'unknown-binding': "A property binding the component doesn't have.",
  'invalid-value': "A value the attribute or property doesn't take.",
  'missing-import': "An element whose definition the page doesn't import.",
  'event-type': "An event handler whose parameter type doesn't fit the event.",
  'binding-type': "A binding whose literal value doesn't fit what it sets.",
  'missing-element-type': 'A component missing from HTMLElementTagNameMap.',
  css: 'A problem in a css template.',
};

/** A problem's quick fix, for `oxlint --fix`. */
const fixOf = ({fix}: Problem) =>
  fix
    ? {
        fix: (fixer: Fixer) =>
          fixer.replaceTextRange([fix.start, fix.end], fix.newText),
      }
    : {};

const ruleFor = (rule: DiagnosticRule) => ({
  meta: {
    type: 'problem' as const,
    fixable: 'code' as const,
    docs: {
      description: DESCRIPTIONS[rule],
      url: 'https://lit-devtools.oddsquad.dev/guides/language-server/',
    },
    schema: [],
  },
  create(context: RuleContext) {
    return {
      Program() {
        const {text} = context.sourceCode;
        for (const problem of problemsOf(context.filename, text)) {
          if (problem.rule !== rule) continue;
          context.report({
            message: problem.message,
            loc: {
              start: context.sourceCode.getLocFromIndex(problem.start),
              end: context.sourceCode.getLocFromIndex(problem.end),
            },
            ...fixOf(problem),
          });
        }
      },
    };
  },
});

/** The plugin's name, which prefixes its rules: `lit-devtools/event-type`. */
const NAME = 'lit-devtools';

/** An Oxlint config: the plugin, and its rules at their editor severities. */
export interface LitDevtoolsOxlintConfig {
  jsPlugins: string[];
  rules: Record<`${typeof NAME}/${DiagnosticRule}`, 'error' | 'warn' | 'off'>;
}

const LINT_SEVERITY: Record<Severity, 'error' | 'warn' | 'off'> = {
  error: 'error',
  warning: 'warn',
  info: 'warn',
  hint: 'warn',
  off: 'off',
};

/**
 * The plugin with each rule at the severity the editor gives it, for
 * `extends` in an `oxlint.config.ts`. It names this file by path, so it loads
 * wherever the package is installed.
 */
const recommended: LitDevtoolsOxlintConfig = {
  jsPlugins: [fileURLToPath(import.meta.url)],
  rules: Object.fromEntries(
    DIAGNOSTIC_RULES.map((rule) => [
      `${NAME}/${rule}`,
      LINT_SEVERITY[DEFAULT_SEVERITIES[rule]],
    ])
  ) as LitDevtoolsOxlintConfig['rules'],
};

const plugin = {
  meta: {name: NAME},
  rules: Object.fromEntries(
    DIAGNOSTIC_RULES.map((rule) => [rule, ruleFor(rule)])
  ),
  configs: {recommended},
};

export default plugin;
