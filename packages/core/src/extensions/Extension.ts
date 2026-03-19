import type { Schema } from "prosemirror-model";
import type {
  ExtensionConfig,
  ExtensionContext,
  ResolvedExtension,
} from "./types";

/**
 * Extension — the base unit of editor capability.
 *
 * Usage:
 *   const Bold = Extension.create({ name: 'bold', addMarks() { ... } });
 *
 *   // Use with defaults
 *   new Editor({ extensions: [Bold] });
 *
 *   // Configure before use
 *   new Editor({ extensions: [Bold.configure({ shortcuts: false })] });
 */
export class Extension<Options extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  readonly options: Options;

  private readonly config: ExtensionConfig<Options>;

  private constructor(config: ExtensionConfig<Options>, options: Options) {
    this.name = config.name;
    this.options = options;
    this.config = config;
  }

  /**
   * Create a new Extension from a config object.
   *
   * Returns an Extension instance with `defaultOptions` applied.
   * Call `.configure()` to override specific options before passing to Editor.
   */
  static create<Opts extends Record<string, unknown> = Record<string, unknown>>(
    config: ExtensionConfig<Opts>
  ): Extension<Opts> {
    return new Extension<Opts>(config, (config.defaultOptions ?? {}) as Opts);
  }

  /**
   * Returns a new Extension with the given options shallow-merged over the current ones.
   *
   * @example
   * // Disable default keyboard shortcuts for this extension
   * StarterKit.configure({ history: false })
   */
  configure(options: Partial<Options>): Extension<Options> {
    return new Extension(this.config, { ...this.options, ...options });
  }

  /**
   * Resolve this extension into a plain object that ExtensionManager can consume.
   *
   * @param schema — the fully built ProseMirror Schema (from Phase 1 of all extensions)
   *                 Only needed for Phase 2 callbacks. Pass undefined during schema build.
   */
  resolve(schema?: Schema): ResolvedExtension {
    const { config, name, options } = this;

    // Phase 2 context — available to addKeymap, addCommands, addProseMirrorPlugins
    const ctx: ExtensionContext<Options> = {
      name,
      options,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      schema: schema!,
    };

    return {
      name,
      nodes: config.addNodes?.() ?? {},
      marks: config.addMarks?.() ?? {},
      // Phase 2 callbacks called with context bound as `this`
      plugins: schema ? (config.addProseMirrorPlugins?.call(ctx) ?? []) : [],
      keymap:  schema ? (config.addKeymap?.call(ctx) ?? {}) : {},
      commands: schema ? (config.addCommands?.call(ctx) ?? {}) : {},
      // Phase 3 / 4 — no schema dependency
      layoutHandler: config.addLayoutHandler?.() ?? null,
      markDecorators: new Map(Object.entries(config.addMarkDecorators?.() ?? {})),
    };
  }
}
