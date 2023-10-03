import { useEditor, useValue } from '@digitalsamba/editor'

/** @public */
export function useCanUndo() {
	const editor = useEditor()
	return useValue('useCanUndo', () => editor.canUndo, [editor])
}
