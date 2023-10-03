import { SerializedSchema } from '@digitalsamba/store'
import { TLAsset, TLShape, TLShapeId } from '@digitalsamba/tlschema'

/** @public */
export interface TLContent {
	shapes: TLShape[]
	rootShapeIds: TLShapeId[]
	assets: TLAsset[]
	schema: SerializedSchema
}
