import { TLDefaultColorTheme, TLGeoShape, TLShapeId } from '@digitalsamba/editor'
import * as React from 'react'
import {
	ShapeFill,
	getShapeFillSvg,
	getSvgWithShapeFill,
	useDefaultColorTheme,
} from '../../shared/ShapeFill'
import { cloudSvgPath } from '../cloudOutline'

export const SolidStyleCloud = React.memo(function SolidStyleCloud({
	fill,
	color,
	strokeWidth,
	w,
	h,
	id,
	size,
}: Pick<TLGeoShape['props'], 'fill' | 'color' | 'w' | 'h' | 'size'> & {
	strokeWidth: number
	id: TLShapeId
}) {
	const theme = useDefaultColorTheme()
	const path = cloudSvgPath(w, h, id, size)

	return (
		<>
			<ShapeFill theme={theme} d={path} fill={fill} color={color} />
			<path d={path} stroke={theme[color].solid} strokeWidth={strokeWidth} fill="none" />
		</>
	)
})

export function SolidStyleCloudSvg({
	fill,
	color,
	strokeWidth,
	theme,
	w,
	h,
	id,
	size,
}: Pick<TLGeoShape['props'], 'fill' | 'color' | 'w' | 'h' | 'size'> & {
	strokeWidth: number
	theme: TLDefaultColorTheme
	id: TLShapeId
}) {
	const pathData = cloudSvgPath(w, h, id, size)

	const strokeElement = document.createElementNS('http://www.w3.org/2000/svg', 'path')
	strokeElement.setAttribute('d', pathData)
	strokeElement.setAttribute('stroke-width', strokeWidth.toString())
	strokeElement.setAttribute('stroke', theme[color].solid)
	strokeElement.setAttribute('fill', 'none')

	// Get the fill element, if any
	const fillElement = getShapeFillSvg({
		d: pathData,
		fill,
		color,
		theme,
	})

	return getSvgWithShapeFill(strokeElement, fillElement)
}
