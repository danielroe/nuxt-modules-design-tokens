import { existsSync } from 'fs'
import { rm, writeFile } from 'fs/promises'
import type { Core as Instance } from 'browser-style-dictionary/types/browser'
import StyleDictionary from 'browser-style-dictionary/browser.js'
import { Dictionary } from 'browser-style-dictionary/types/Dictionary'
import { tsTypesDeclaration, tsFull, jsFull } from './formats'
import { createTokensDir } from './utils'
import type { NuxtDesignTokens } from './index'

export const stubTokens = async (buildPath: string, force = false) => {
  const files = {
    '__uses-tokens.ts': () => '',
    'tokens.css': () => '/* This file is empty because no tokens has been provided. */',
    'tokens.scss': () => '/* This file is empty because no tokens has been provided. */',
    'tokens.json': () => '{}',
    'index.js': jsFull,
    'index.ts': tsFull,
    'types.d.ts': tsTypesDeclaration
  }

  for (const [file, stubbingFunction] of Object.entries(files)) {
    const path = `${buildPath}${file}`

    if (force && existsSync(path)) { await rm(path) }

    if (!existsSync(path)) { await writeFile(path, stubbingFunction ? stubbingFunction({ tokens: {} }) : '') }
  }
}

export const getStyleDictionaryInstance = async (tokens: NuxtDesignTokens, buildPath: string) => {
  let styleDictionary: Instance = StyleDictionary

  styleDictionary.fileHeader = {}

  styleDictionary.registerTransformGroup({
    name: 'tokens-js',
    transforms: ['name/cti/kebab', 'size/px', 'color/hex']
  })

  styleDictionary.registerFormat({
    name: 'typescript/types-declaration',
    formatter ({ dictionary }) {
      return tsTypesDeclaration(dictionary)
    }
  })

  styleDictionary.registerFormat({
    name: 'typescript/full',
    formatter ({ dictionary }) {
      return tsFull(dictionary)
    }
  })

  styleDictionary.registerFormat({
    name: 'javascript/full',
    formatter ({ dictionary }) {
      return jsFull(dictionary)
    }
  })

  styleDictionary = await styleDictionary.extend({
    tokens,
    platforms: {
      scss: {
        transformGroup: 'tokens-js',
        buildPath,
        files: [
          {
            destination: 'tokens.scss',
            format: 'scss/variables'
          }
        ]
      },

      json: {
        transformGroup: 'tokens-js',
        buildPath,
        files: [
          {
            destination: 'tokens.json',
            format: 'json/flat'
          }
        ]
      },

      ts: {
        transformGroup: 'tokens-js',
        buildPath,
        files: [
          {
            destination: 'index.ts',
            format: 'typescript/full'
          },
          {
            destination: 'types.d.ts',
            format: 'typescript/types-declaration'
          }
        ]
      },

      js: {
        transformGroup: 'tokens-js',
        buildPath,
        files: [
          {
            destination: 'index.js',
            format: 'javascript/full'
          }
        ]
      },

      css: {
        transformGroup: 'tokens-js',
        buildPath,
        files: [
          {
            destination: 'tokens.css',
            format: 'css/variables'
          }
        ]
      },

      done: {
        actions: ['done']
      }
    }
  })

  return styleDictionary
}

const generateTokensOutputs = (styleDictionary: Instance, silent = true) => new Promise<Dictionary>(
  (resolve, reject) => {
    try {
      // Weird trick to disable nasty logging
      if (silent) {
      // @ts-ignore
      // eslint-disable-next-line no-console
        console._log = console.log
        // eslint-disable-next-line no-console
        console.log = () => {}
      }

      // Actions run at the end of build, helps on awaiting it properly
      styleDictionary.registerAction({
        name: 'done',
        do: (dictionary) => {
          resolve(dictionary)
        },
        undo: () => {
          //
        }
      })

      styleDictionary.cleanAllPlatforms()

      styleDictionary.buildAllPlatforms()

      // Weird trick to disable nasty logging
      if (silent) {
      // @ts-ignore
      // eslint-disable-next-line no-console
        console.log = console._log
      }
    } catch (e) {
      reject(e)
    }
  }
)

export const generateTokens = async (
  tokens: NuxtDesignTokens,
  buildPath: string,
  silent = true
) => {
  // Check for tokens directory existence; it might get cleaned-up from `.nuxt`
  if (!existsSync(buildPath)) { await createTokensDir(buildPath) }

  // Stub tokens if no tokens provided
  if (!tokens || !Object.keys(tokens).length) {
    await stubTokens(buildPath, true)
    return
  }

  // Get styleDictionary instance
  const styleDictionary = await getStyleDictionaryInstance(tokens, buildPath)

  // Generate outputs silently
  return await generateTokensOutputs(styleDictionary, silent)
}
