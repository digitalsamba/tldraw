import {
	TLArrowShape,
	TLDrawShape,
	TLGroupShape,
	TLLineShape,
	useEditor,
	useValue,
} from '@digitalsamba/editor'

export function useOnlyFlippableShape() {
	const editor = useEditor()
	return useValue(
		'onlyFlippableShape',
		() => {
			const { selectedShapes } = editor
			return (
				selectedShapes.length === 1 &&
				selectedShapes.every(
					(shape) =>
						editor.isShapeOfType<TLGroupShape>(shape, 'group') ||
						editor.isShapeOfType<TLArrowShape>(shape, 'arrow') ||
						editor.isShapeOfType<TLLineShape>(shape, 'line') ||
						editor.isShapeOfType<TLDrawShape>(shape, 'draw')
				)
			)
		},
		[editor]
	)
}
