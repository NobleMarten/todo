import { motion, AnimatePresence } from "framer-motion"

export type ToastState = { type: "success" | "error"; text: string } | null

export function Toast({ toast }: { toast: ToastState }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.98 }}
          transition={{ duration: 0.18 }}
          style={{
            position: "fixed",
            top: 14,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: toast.type === "error" ? "rgba(255, 60, 60, 0.12)" : "rgba(60, 255, 160, 0.10)",
            color: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(10px)",
            zIndex: 9999,
            maxWidth: "min(560px, calc(100vw - 24px))",
          }}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
