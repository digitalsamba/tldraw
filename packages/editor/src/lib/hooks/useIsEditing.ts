import { useValue } from '@digitalsamba/state'
import { TLShapeId } from '@digitalsamba/tlschema'
import { useEditor } from './useEditor'

/** @public */
export function useIsEditing(shapeId: TLShapeId) {
	const editor = useEditor()
	return useValue('isEditing', () => editor.editingShapeId === shapeId, [editor, shapeId])
}
