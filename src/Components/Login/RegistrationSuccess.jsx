import { motion, AnimatePresence } from "framer-motion";

function RegistrationSuccess({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: "spring", stiffness: 350, damping: 25 }}
          className="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl text-center space-y-4 relative overflow-hidden"
        >
          {/* Animated Green Tick Icon with Glow */}
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-16 w-16 rounded-full bg-emerald-400 opacity-20"></span>
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: "spring", stiffness: 400, damping: 15 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white text-3xl font-extrabold shadow-lg shadow-emerald-500/30"
            >
              ✓
            </motion.div>
          </div>

          {/* Text Content with Updated Email Info */}
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">
              Registration Logged!
            </h3>

            <p className="text-xs text-slate-500 px-2 leading-relaxed">
              Thank you for registering. Your request is now under review. We will notify you via email shortly once your account is activated.
            </p>
          </div>

          {/* Action Button */}
          <button
            type="button"
            onClick={onClose}
            className="w-full cursor-pointer rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          >
            Got It, Thanks!
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default RegistrationSuccess;