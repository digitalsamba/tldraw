import { useEditor, usePresence, useValue } from '@digitalsamba/editor'

export function FollowingIndicator() {
	const editor = useEditor()
	const followingUserId = useValue('follow', () => editor.instanceState.followingUserId, [editor])
	if (!followingUserId) return null
	return <FollowingIndicatorInner userId={followingUserId} />
}

function FollowingIndicatorInner({ userId }: { userId: string }) {
	const presence = usePresence(userId)
	if (!presence) return null
	return <div className="tlui-following-indicator" style={{ borderColor: presence.color }} />
}
