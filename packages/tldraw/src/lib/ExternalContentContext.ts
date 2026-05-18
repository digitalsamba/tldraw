import { createContext } from 'react'
import type { TLExternalContentProps } from './defaultExternalContentHandlers'

export const ExternalContentContext = createContext<Partial<TLExternalContentProps>>({
	acceptedImageMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml'],
	acceptedVideoMimeTypes: ['video/mp4', 'video/quicktime'],
	maxImageDimension: 1000,
	maxAssetSize: 10 * 1024 * 1024,
})
