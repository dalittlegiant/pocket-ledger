import { create } from 'zustand'

export interface TxnPrefill {
  amount: string // e.g. "68.00" — pre-filled into the sheet's amount input
  note: string // e.g. "Starbucks"
  kind: 'expense' | 'income' // extracted from the SMS (refunds → income)
}

interface UIState {
  isAddTxnModalOpen: boolean
  openAddTxn: () => void
  closeAddTxn: () => void
  /** One-shot prefill for the sheet (e.g. from the iOS Shortcuts SMS bridge). */
  txnPrefill: TxnPrefill | null
  setTxnPrefill: (p: TxnPrefill | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  isAddTxnModalOpen: false,
  openAddTxn: () => set({ isAddTxnModalOpen: true }),
  closeAddTxn: () => set({ isAddTxnModalOpen: false }),
  txnPrefill: null,
  setTxnPrefill: (txnPrefill) => set({ txnPrefill }),
}))
