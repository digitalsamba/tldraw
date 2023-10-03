import { useEditor, useValue } from '@digitalsamba/editor'

/** @public */
export function useCanRedo() {
	const editor = useEditor()
	return useValue('useCanRedo', () => editor.canRedo, [editor])
}
