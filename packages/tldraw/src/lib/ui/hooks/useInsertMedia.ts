import { useEditor } from '@digitalsamba/editor'
import { useCallback, useContext, useEffect, useRef } from 'react'
import { ExternalContentContext } from '../../ExternalContentContext'

export function useInsertMedia() {
	const editor = useEditor()
	const externalContentProps = useContext(ExternalContentContext)
	const inputRef = useRef<HTMLInputElement>()

	useEffect(() => {
		const input = window.document.createElement('input')
		input.type = 'file'

		// Build accept string from context props, defaulting to images only
		const acceptedImageMimeTypes = externalContentProps?.acceptedImageMimeTypes || [
			'image/jpeg',
			'image/png',
			'image/gif',
			'image/svg+xml',
		]
		const acceptedVideoMimeTypes = externalContentProps?.acceptedVideoMimeTypes || []

		input.accept = [...acceptedImageMimeTypes, ...acceptedVideoMimeTypes].join(',')
		input.multiple = true
		inputRef.current = input
		async function onchange(e: Event) {
			const fileList = (e.target as HTMLInputElement).files
			if (!fileList || fileList.length === 0) return
			await editor.putExternalContent({
				type: 'files',
				files: Array.from(fileList),
				point: editor.viewportPageBounds.center,
				ignoreParent: false,
			})
			input.value = ''
		}
		input.addEventListener('change', onchange)
		return () => {
			inputRef.current = undefined
			input.removeEventListener('change', onchange)
		}
	}, [editor, externalContentProps])

	return useCallback(() => {
		inputRef.current?.click()
	}, [inputRef])
}
