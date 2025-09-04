import { Tldraw } from '@digitalsamba/tldraw'
import '@digitalsamba/tldraw/tldraw.css'

export default function BasicExample() {
	return (
		<div className="tldraw__editor">
			<Tldraw forceMobileStylePanel persistenceKey="tldraw_example" />
		</div>
	)
}
