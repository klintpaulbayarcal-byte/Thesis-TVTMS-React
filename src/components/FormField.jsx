export default function FormField({ label, required, hint, children }) {
  return <label className="field"><span>{label}{required && <b> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>;
}
