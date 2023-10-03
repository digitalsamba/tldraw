import { useEditor, useValue } from '@digitalsamba/editor'

export function useForceSolid() {
	const editor = useEditor()
	return useValue('zoom', () => editor.zoomLevel < 0.35, [editor])
}
