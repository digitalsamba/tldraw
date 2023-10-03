import { Tldraw } from '@digitalsamba/tldraw'
import '@digitalsamba/tldraw/tldraw.css'

export default function ScrollExample() {
	return (
		<div
			style={{
				width: '150vw',
				height: '150vh',
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				backgroundColor: '#fff',
			}}
		>
			<div style={{ width: '60vw', height: '80vh' }}>
				<Tldraw persistenceKey="scroll-example" />
			</div>
		</div>
	)
}
