import Modal from './Modal';
export default function ConfirmDialog({ open, title='Confirm action', message, confirmLabel='Confirm', danger=false, onConfirm, onClose }) {
  return <Modal open={open} title={title} onClose={onClose} footer={<><button className="btn btn-secondary" onClick={onClose}>Cancel</button><button className={`btn ${danger?'btn-danger':'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button></>}><p>{message}</p></Modal>;
}
