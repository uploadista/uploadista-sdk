/* eslint-disable */
import * as Router from 'expo-router';

export * from 'expo-router';

declare module 'expo-router' {
  export namespace ExpoRouter {
    export interface __routes<T extends string | object = string> {
      hrefInputParams: { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/flow-upload` | `/flow-upload`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/gallery-upload` | `/gallery-upload`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/multi-upload` | `/multi-upload`; params?: Router.UnknownInputParams; };
      hrefOutputParams: { pathname: Router.RelativePathString, params?: Router.UnknownOutputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownOutputParams } | { pathname: `/_sitemap`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/flow-upload` | `/flow-upload`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/gallery-upload` | `/gallery-upload`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownOutputParams; } | { pathname: `${'/(tabs)'}/multi-upload` | `/multi-upload`; params?: Router.UnknownOutputParams; };
      href: Router.RelativePathString | Router.ExternalPathString | `/_sitemap${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/flow-upload${`?${string}` | `#${string}` | ''}` | `/flow-upload${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/gallery-upload${`?${string}` | `#${string}` | ''}` | `/gallery-upload${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}${`?${string}` | `#${string}` | ''}` | `/${`?${string}` | `#${string}` | ''}` | `${'/(tabs)'}/multi-upload${`?${string}` | `#${string}` | ''}` | `/multi-upload${`?${string}` | `#${string}` | ''}` | { pathname: Router.RelativePathString, params?: Router.UnknownInputParams } | { pathname: Router.ExternalPathString, params?: Router.UnknownInputParams } | { pathname: `/_sitemap`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/flow-upload` | `/flow-upload`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/gallery-upload` | `/gallery-upload`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}` | `/`; params?: Router.UnknownInputParams; } | { pathname: `${'/(tabs)'}/multi-upload` | `/multi-upload`; params?: Router.UnknownInputParams; };
    }
  }
}
