import { track, useEditor } from '@digitalsamba/editor'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useReadonly } from '../hooks/useReadonly'
import { ActionsMenu } from './ActionsMenu'
import { DuplicateButton } from './DuplicateButton'
import { Menu } from './Menu'
import { PageMenu } from './PageMenu/PageMenu'
import { RedoButton } from './RedoButton'
import { TrashButton } from './TrashButton'
import { UndoButton } from './UndoButton'

export const MenuZone = track(function MenuZone({
	renderMenuZoneItems,
}: {
	renderMenuZoneItems?: () => React.ReactNode
}) {
	const editor = useEditor()

	const breakpoint = useBreakpoint()
	const isReadonly = useReadonly()

	return (
		<div className="tlui-menu-zone">
			<div className="tlui-buttons__horizontal">
				<Menu />
				<PageMenu />
				{breakpoint >= 6 && !isReadonly && !editor.isInAny('hand', 'zoom') && (
					<>
						<UndoButton />
						<RedoButton />
						<TrashButton />
						<DuplicateButton />
						{renderMenuZoneItems?.()}
						<ActionsMenu />
					</>
				)}
			</div>
		</div>
	)
})
