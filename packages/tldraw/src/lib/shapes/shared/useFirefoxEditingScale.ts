import { useEditor, useValue } from '@digitalsamba/editor'
import { CSSProperties, useContext } from 'react'
import { FirefoxEditingScaleContext } from '../../FirefoxEditingScaleContext'

/**
 * Firefox fails to paint the text caret at certain sub-pixel positions when the
 * editable element is rendered inside a `transform: scale(x)` with `x < 1`
 * (Mozilla bug 226301). When the camera is zoomed out (e.g. a content board
 * fitted to a large background image), the editing `<textarea>` is scaled down
 * and the caret disappears on those positions.
 *
 * To avoid it we render the editing textarea at device-scale 1: counter the
 * camera zoom with `transform: scale(1 / zoom)` and multiply every px metric by
 * `zoom` so the on-screen size stays identical.
 *
 * This is strictly opt-in: it only does anything when the consumer passes
 * `enableFirefoxEditingScale` to `<Tldraw />`, and even then only in Firefox
 * while the zoom is fractional — a no-op otherwise.
 *
 * https://bugzilla.mozilla.org/show_bug.cgi?id=226301
 */
export function useFirefoxEditingScale(
	isEditing: boolean,
	fontSize: number,
	lineHeight: number,
	padding: number
): CSSProperties | undefined {
	const editor = useEditor()
	const isEnabled = useContext(FirefoxEditingScaleContext)
	const zoom = useValue('editing zoom', () => editor.zoomLevel, [editor])

	if (!isEnabled || !isEditing || !editor.environment.isFirefox || zoom === 1) {
		return undefined
	}

	return {
		transform: `scale(${1 / zoom})`,
		transformOrigin: 'top left',
		width: `${100 * zoom}%`,
		height: `${100 * zoom}%`,
		fontSize: `${fontSize * zoom}px`,
		lineHeight: `${lineHeight * zoom}px`,
		padding: `${padding * zoom}px`,
	}
}
