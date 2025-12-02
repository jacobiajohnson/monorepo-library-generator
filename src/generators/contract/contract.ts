/**
 * Contract Library Generator (Nx Wrapper)
 *
 * Thin wrapper around the shared contract generator core.
 * Uses Nx Tree API via TreeAdapter.
 */

import type { Tree } from "@nx/devkit"
import { formatFiles } from "@nx/devkit"
import { Effect } from "effect"
import { parseTags } from "../../utils/generator-utils"
import { generateLibraryFiles } from "../../utils/library-generator-utils"
import { standardizeGeneratorOptions, type NormalizedBaseOptions } from "../../utils/normalization-utils"
import { createTreeAdapter } from "../../utils/tree-adapter"
import { detectWorkspaceConfig, type WorkspaceConfig } from "../../utils/workspace-detection"
import { generateContractCore, type GeneratorResult } from "../core/contract-generator-core"
import type { ContractGeneratorSchema } from "./schema"

/**
 * Normalized options with computed values
 */
type NormalizedContractOptions = NormalizedBaseOptions

/**
 * Contract generator for Nx workspaces
 *
 * Generates a contract library following Effect-based architecture patterns.
 * Creates entities, errors, events, and ports for a domain.
 *
 * @param tree - Nx Tree API for virtual file system
 * @param schema - Generator options from user
 * @returns Callback function for post-generation console output
 */
export default async function contractGenerator(
  tree: Tree,
  schema: ContractGeneratorSchema
) {
  // Validate required fields
  if (!schema.name || schema.name.trim() === "") {
    throw new Error("Contract name is required and cannot be empty")
  }

  const options = normalizeOptions(tree, schema)

  // Build tags using shared tag utility
  const defaultTags = [
    "type:contract",
    `domain:${options.fileName}`,
    "platform:universal"
  ]
  const tags = parseTags(schema.tags, defaultTags)

  // 1. Generate base library files using centralized utility
  const libraryOptions = {
    name: options.name,
    projectName: options.projectName,
    projectRoot: options.projectRoot,
    offsetFromRoot: options.offsetFromRoot,
    libraryType: "contract" as const,
    platform: "universal" as const,
    description: options.description,
    tags,
    includeCQRS: schema.includeCQRS ?? false,
    includeRPC: schema.includeRPC ?? false
  }

  await generateLibraryFiles(tree, libraryOptions)

  // 2. Generate domain-specific files using shared core
  const adapter = createTreeAdapter(tree)

  // Parse entities if provided (comma-separated string)
  let entities: ReadonlyArray<string> | undefined
  if (schema.entities) {
    if (typeof schema.entities === 'string') {
      // Split on comma and trim whitespace
      entities = schema.entities.split(',').map(e => e.trim()).filter(e => e.length > 0)
    } else {
      entities = schema.entities
    }
  }

  const coreOptions: Parameters<typeof generateContractCore>[1] = {
    name: schema.name,
    ...(schema.description && { description: schema.description }),
    ...(schema.tags && { tags: schema.tags }),
    ...(schema.directory && { directory: schema.directory }),
    ...(entities && { entities }),
    includeCQRS: schema.includeCQRS ?? false,
    includeRPC: schema.includeRPC ?? false,
    workspaceRoot: tree.root,
    // Pass pre-computed paths from Nx normalization to avoid double generation
    projectName: options.projectName,
    projectRoot: options.projectRoot,
    packageName: options.packageName,
    sourceRoot: options.sourceRoot
  }

  // 3. Run core generator with Effect runtime
  const result: GeneratorResult = await Effect.runPromise(
    generateContractCore(adapter, coreOptions) as Effect.Effect<GeneratorResult, never>
  )

  // 5. Format files
  await formatFiles(tree)

  // 6. Return post-generation instructions
  return () => {
    const entityCount = entities?.length ?? 1
    const entityList = entities?.join(", ") ?? options.className

    console.log(`
✅ Contract library created: ${result.packageName}

📁 Location: ${result.projectRoot}
📦 Package: ${result.packageName}
📂 Files generated: ${result.filesGenerated.length}
🎯 Entities: ${entityCount} (${entityList})

⚡ Bundle Optimization Features:
   ✓ Separate entity files for tree-shaking
   ✓ Granular package.json exports
   ✓ Type-only imports (zero runtime overhead)

   Import examples:
   - Granular:  import { Product } from '${result.packageName}/entities/product'
   - Barrel:    import { Product } from '${result.packageName}/entities'
   - Type-only: import type { Product } from '${result.packageName}/types'

🎯 IMPORTANT - Customization Required:
This library was generated with minimal scaffolding.
Follow the TODO comments in each file to customize for your domain.

🎯 Next Steps:
1. Customize domain files (see TODO comments in each file):
   - ${result.sourceRoot}/lib/entities/* - Add your domain fields to each entity
   - ${result.sourceRoot}/lib/errors.ts  - Add domain-specific errors
   - ${result.sourceRoot}/lib/events.ts  - Add custom events
   - ${result.sourceRoot}/lib/ports.ts   - Add repository/service methods

2. Build and test:
   - pnpm exec nx build ${result.projectName} --batch
   - pnpm exec nx test ${result.projectName}

3. Auto-sync TypeScript project references:
   - pnpm exec nx sync

📚 Documentation:
   - See /libs/ARCHITECTURE.md for repository patterns
   - See ${result.projectRoot}/README.md for customization examples
    `)
  }
}

/**
 * Normalize options with defaults and computed values
 */
function normalizeOptions(
  tree: Tree,
  schema: ContractGeneratorSchema
): NormalizedContractOptions {
  // Detect workspace configuration
  const adapter = createTreeAdapter(tree)
  const workspaceConfig = Effect.runSync(
    detectWorkspaceConfig(adapter).pipe(
      Effect.orDie
    ) as Effect.Effect<WorkspaceConfig, never, never>
  )

  // Use shared normalization utility for common fields
  return standardizeGeneratorOptions(tree, {
    name: schema.name,
    ...(schema.directory !== undefined && { directory: schema.directory }),
    ...(schema.description !== undefined && { description: schema.description }),
    libraryType: "contract"
  }, workspaceConfig)
}
