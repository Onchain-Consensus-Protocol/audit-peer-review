import React from"react";
export function Button({className="",children,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>){return <button className={`inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 px-5 text-sm font-medium transition hover:border-orange-500 hover:text-orange-600 disabled:opacity-50 ${className}`} {...props}>{children}</button>}
