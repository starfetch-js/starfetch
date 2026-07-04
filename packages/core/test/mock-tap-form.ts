export async function readMockFormData(
  request: Request,
  contentType: string | null,
): Promise<Map<string, string>> {
  if (contentType?.startsWith("multipart/form-data") !== true) {
    return new Map();
  }

  const values = new Map<string, string>();

  for (const [key, value] of await request.formData()) {
    if (typeof value === "string") {
      values.set(key, value);
      continue;
    }

    values.set(key, await value.text());
  }

  return values;
}
