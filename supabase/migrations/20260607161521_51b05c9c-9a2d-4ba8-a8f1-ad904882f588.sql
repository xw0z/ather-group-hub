CREATE POLICY "Refinery users can read receipt files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'refinery-receipts'
  AND public.can_access_refinery(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Refinery users can create receipt files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'refinery-receipts'
  AND public.can_access_refinery(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Refinery users can replace receipt files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'refinery-receipts'
  AND public.can_access_refinery(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'refinery-receipts'
  AND public.can_access_refinery(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Refinery users can remove receipt files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'refinery-receipts'
  AND public.can_access_refinery(auth.uid(), ((storage.foldername(name))[1])::uuid)
);