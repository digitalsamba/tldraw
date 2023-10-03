import { T } from '@digitalsamba/validate'
import { StyleProp } from './StyleProp'

/** @public */
export const DefaultFillStyle = StyleProp.defineEnum('tldraw:fill', {
	defaultValue: 'none',
	values: ['none', 'semi', 'solid', 'pattern'],
})

/** @public */
export type TLDefaultFillStyle = T.TypeOf<typeof DefaultFillStyle>
