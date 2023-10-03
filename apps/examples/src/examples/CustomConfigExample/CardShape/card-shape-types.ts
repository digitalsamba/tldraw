import { TLBaseShape, TLDefaultColorStyle } from '@digitalsamba/tldraw'

// We'll have a custom style called weight
export type IWeightStyle = 'regular' | 'bold'

// A type for our custom card shape
export type ICardShape = TLBaseShape<
	'card',
	{
		w: number
		h: number
		color: TLDefaultColorStyle
		weight: IWeightStyle
	}
>
