// @ts-nocheck
/**
 * Velxio-local custom elements.
 *
 * These are wokwi-style web components that live IN this project rather
 * than in the upstream `@wokwi/elements` package — useful when we don't
 * have push access to wokwi/wokwi-elements but still need to ship new
 * parts. Velxio-originals use the `velxio-` prefix (e.g.
 * `<velxio-capacitor-electrolytic>`); local fallbacks for upstream names
 * (e.g. `<wokwi-capacitor>`, `<wokwi-inductor>`) are guarded against
 * double-registration so they only kick in if `@wokwi/elements` isn't loaded.
 *
 * Side-effect import: each module calls `customElements.define(...)` at
 * load time (guarded against double-registration), so a single
 * `import '@/components/velxio/velxio-elements/velxio-elements';` is enough to make the tags resolvable.
 */

import "@/components/velxio/velxio-elements/capacitor-element";
import "@/components/velxio/velxio-elements/capacitor-electrolytic-element";
import "@/components/velxio/velxio-elements/inductor-element";
import "@/components/velxio/velxio-elements/custom-chip-element";
import "@/components/velxio/components/velxio-components/KitModuleElements";

export { CapacitorElement } from "@/components/velxio/velxio-elements/capacitor-element";
export { CapacitorElectrolyticElement } from "@/components/velxio/velxio-elements/capacitor-electrolytic-element";
export { InductorElement } from "@/components/velxio/velxio-elements/inductor-element";
