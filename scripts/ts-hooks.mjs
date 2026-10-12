/**
 * Lets Node run the app's bundler-style, extensionless imports
 * (`import { db } from '../db'`) directly from .ts sources.
 *
 *   node --import ./scripts/ts-hooks.mjs scripts/report-smoke.ts
 */
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (err) {
      const relative = specifier.startsWith('./') || specifier.startsWith('../')
      if (relative && !/\.[cm]?[jt]sx?$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context)
      }
      throw err
    }
  },
})
