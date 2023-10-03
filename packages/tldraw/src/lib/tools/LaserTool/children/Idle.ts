import { StateNode, TLEventHandlers } from '@digitalsamba/editor'

export class Idle extends StateNode {
	static override id = 'idle'

	override onPointerDown: TLEventHandlers['onPointerDown'] = (info) => {
		this.parent.transition('lasering', info)
	}
}
