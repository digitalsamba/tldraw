import { useValue } from '@digitalsamba/state'
import { TLShapeId } from '@digitalsamba/tlschema'
import { useEditor } from './useEditor'

/** @public */
export function useIsCropping(shapeId: TLShapeId) {
	const editor = useEditor()
	return useValue('isCropping', () => editor.croppingShapeId === shapeId, [editor, shapeId])
}
