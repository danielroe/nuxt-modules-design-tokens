import { kebabCase } from 'scule'
import chalk from 'chalk'
import { $tokens } from '../index'
import { logger } from '../utils'
// @ts-ignore
import type { DesignTokens, DesignToken } from '#design-tokens/types'

const variantPropsRegex = /\$variantProps\('(.*)'\)/g
const screenRegex = /(@screen\s(.*?)\s{)/g
const darkRegex = /(@dark\s{)/g
const lightRegex = /(@light\s{)/g
const dtRegex = /\$dt\('(.*?)'\)/g
const componentRegex = /@component\('(.*?)'\);/g

/**
 * Resolve `$dt()` declarations.
 *
 * Supports `wrapper` to be used in both `<style>` and `<script>` or `<template>` tags.
 */
export const resolveDt = (code: string, wrapper = undefined) => {
  const replace = (path: string): string => `${wrapper || ''}var(--${path.split('.').map(key => kebabCase(key)).join('-')})${wrapper || ''}`

  code = code.replace(dtRegex, (_, path) => replace(path))

  return code
}

/**
 * Resolve `@component()`.
 */
export const resolveVariantProps = (code: string): string => {
  code = code.replace(variantPropsRegex, (_, componentName) => {
    const variants = $tokens(('components.' + componentName + '.variants') as any, { key: undefined, flatten: false, silent: true })

    if (!variants) {
      return `{
        variants: {
          type: Array,
          required: false,
          default: []
        }
      }`
    }

    return `{
      variants: {
        type: Array as import('vue').PropType<${Object.keys(variants).map(variant => `'${variant}'`).join(' | ')}>,
        required: false,
        default: []
      }
    }`
  })

  return code
}

export const resolveScheme = (code: string, scheme: 'light' | 'dark') => {
  // Only supports `light` and `dark` schemes as they are native from browsers.
  const schemesRegex = {
    lightRegex,
    darkRegex
  }

  code = code.replace(schemesRegex[scheme + 'Regex'], `@media (prefers-color-scheme: ${scheme}) {`)

  return code
}

/**
 * Resolve `@screen {screenSize}` declarations.
 */
export const resolveScreen = (code: string, id: string): string => {
  // @ts-ignore
  const screens = $tokens('screens', {
    flatten: false,
    key: undefined,
    silent: true
  })

  if (!screens) {
    // eslint-disable-next-line no-console
    console.log('`@screens` directive needs you to specify a `screens` set in your tokens.config file.')
    return code
  }

  code = code.replace(screenRegex, (_, _screenDeclaration, screenSize) => {
    const screenToken = screens[screenSize]

    if (screenToken) {
      return `@media (min-width: ${screenToken.value}) {`
    }

    logger.warn(
      'Error in component:',
      id,
      'This screen size is not defined: ' + chalk.red(screenSize) + '\n\n',
      'Available screen sizes: ', Object.keys(screens).map(screen => chalk.green(screen)).join(', ')
    )

    return '@media (min-width: 0px) {'
  })

  return code
}

/**
 * Resolve `@component()`.
 */
export const resolveComponent = (code: string): string => {
  code = code.replace(componentRegex, (_, componentName) => {
    const component = $tokens(('components.' + componentName) as any, { key: undefined, flatten: false, silent: true })

    if (component && Object.keys(component)) {
      const styleDeclaration = resolveStyleFromComponent(component)
      return styleDeclaration
    }

    return ''
  })

  return code
}

/**
 * Resolve unwrapped style properties for `@component()` declaration.
 */
export const resolveStyleFromComponent = (component: DesignTokens): string => {
  // Prepare style declaration
  let styleDeclaration = ''
  const styles = {
    root: {
      propertiesLines: [],
      nestings: []
    }
  }

  // Deeply resolving `compose` definition from tokens
  const resolvePropertiesObject = (value: DesignToken, target = styles.root) => {
    Object.entries(value).forEach(([_key, _value]: [any, DesignToken]) => {
      const { variable, pseudo, property } = _value

      if (_key === 'variants') {
        Object.entries(_value).forEach(([_variantKey, _variantValue]) => {
          // Init variant
          if (!styles[_variantKey]) {
            styles[_variantKey] = {
              nestings: [],
              propertiesLines: []
            }
          }

          resolvePropertiesObject(_variantValue, styles[_variantKey])
        })
        return
      }

      if (pseudo) {
        if (!target.nestings[pseudo]) { target.nestings[pseudo] = [] }
        target.nestings[pseudo].push(`${property}: ${variable};`)
        return
      }

      target.propertiesLines.push(`${property}: ${variable};`)
    }, {})
  }
  resolvePropertiesObject(component)

  // Recompose styles
  Object
    .entries(styles)
    .forEach(
      ([key, { propertiesLines, nestings }]) => {
        let localDeclaration = ''
        localDeclaration = propertiesLines.join('\n')
        Object.entries(nestings).forEach(([nested, _propertiesLines]) => {
          localDeclaration += `\n&${nested} {\n${_propertiesLines.join('\n')}\n}`
        })

        key === 'root'
          ? styleDeclaration += localDeclaration
          : styleDeclaration += `&.${key} {\n${localDeclaration}\n}`
      }
    )

  return styleDeclaration
}
