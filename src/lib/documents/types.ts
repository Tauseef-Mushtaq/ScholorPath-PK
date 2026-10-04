/** Only the columns the vault UI needs. `user_id`, `storage_path` and `extracted_text_reference` are never sent to the browser. */
export type DocumentRow = {
  id: string;
  document_type: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

/** State returned by every documents Server Action (used with useActionState). */
export type DocumentFormState = {
  error?: string;
  success?: string;
};
