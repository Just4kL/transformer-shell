import { create } from 'zustand'
import type { SnapTier } from './grid'

/** Направляющие выравнивания в координатах рабочего поля. */
export interface Guides {
  v: number[]
  h: number[]
}

interface InteractionState {
  /** id перетаскиваемого блока */
  moving: string | null
  /** id блока, который тянут за угол/грань */
  resizing: string | null
  /** тянут ли разделитель рельса */
  rail: boolean
  guides: Guides
  tier: SnapTier | null
  /** живой размер рельса при перетаскивании разделителя */
  railPreview: number | null

  begin: (p: { moving?: string | null; resizing?: string | null; rail?: boolean }) => void
  setGuides: (g: Guides) => void
  setTier: (t: SnapTier | null) => void
  setRailPreview: (w: number | null) => void
  end: () => void
}

const EMPTY: Guides = { v: [], h: [] }

export const useInteraction = create<InteractionState>((set) => ({
  moving: null,
  resizing: null,
  rail: false,
  guides: EMPTY,
  tier: null,
  railPreview: null,

  begin: (p) => set({ ...p, guides: EMPTY, tier: null }),
  setGuides: (guides) => set({ guides }),
  setTier: (tier) => set({ tier }),
  setRailPreview: (railPreview) => set({ railPreview }),
  end: () => set({ moving: null, resizing: null, rail: false, guides: EMPTY, tier: null, railPreview: null }),
}))

export const isInteracting = (): boolean => {
  const s = useInteraction.getState()
  return Boolean(s.moving || s.resizing || s.rail)
}
