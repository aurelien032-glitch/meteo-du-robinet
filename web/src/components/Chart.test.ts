import { describe, expect, it } from 'vitest'
import { withFrenchAxes } from './Chart'

type Fmt = (v: number) => string
const fmtOf = (axis: unknown) => (axis as { axisLabel?: { formatter?: Fmt } }).axisLabel?.formatter

describe('withFrenchAxes', () => {
  it("écrit les nombres à la française sur les axes numériques sans formateur", () => {
    const o = withFrenchAxes({ xAxis: { type: 'category' }, yAxis: { type: 'value' } })
    expect(fmtOf(o.xAxis)).toBeUndefined()
    expect(fmtOf(o.yAxis)?.(10000)).toBe('10 000')
    expect(fmtOf(o.yAxis)?.(2.5)).toBe('2,5')
  })

  it('traite un axe des ordonnées sans type comme numérique, et respecte un formateur existant', () => {
    const own: Fmt = (v) => `${v} %`
    const o = withFrenchAxes({ yAxis: [{ axisLabel: { formatter: own } }, {}], xAxis: [{ type: 'log' }] })
    const y = o.yAxis as unknown[]
    expect(fmtOf(y[0])).toBe(own)
    expect(fmtOf(y[1])?.(1500)).toBe('1 500')
    expect(fmtOf((o.xAxis as unknown[])[0])?.(1000)).toBe('1 000')
  })

  it("laisse l'option intacte quand il n'y a pas d'axes", () => {
    expect(withFrenchAxes({ series: [] })).toEqual({ series: [] })
  })
})
