import { create } from 'zustand'

interface UIState {
  isAddTxnModalOpen: boolean
  openAddTxn: () => void
  closeAddTxn: () => void
}

export const useUIStore = create<UIState>((set) => ({
  isAddTxnModalOpen: false,
  openAddTxn: () => set({ isAddTxnModalOpen: true }),
  closeAddTxn: () => set({ isAddTxnModalOpen: false }),
}))
