import { useEditor, useValue } from '@digitalsamba/editor'

/** @public */
export function useReadonly() {
	const editor = useEditor()
	return useValue('isReadonlyMode', () => editor.instanceState.isReadonly, [editor])
}
