import { useState } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa";

const PasswordInput = ({
  value,
  onChange,
  placeholder = "Enter password",
  name,
  error,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <div className="relative">
        <input
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={onChange}
          required
          id={name}
          name={name}
          autoComplete="new-password"
          placeholder={placeholder}
          className=" block w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition duration-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
        />

        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2"
        >
          {showPassword ? (
            <FaEyeSlash className="text-slate-500" />
          ) : (
            <FaEye className="text-slate-500" />
          )}
        </button>
      </div>
    </div>
  );
};

export default PasswordInput;
