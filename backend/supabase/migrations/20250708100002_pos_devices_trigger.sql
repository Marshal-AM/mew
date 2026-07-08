CREATE OR REPLACE FUNCTION public.pos_devices_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_devices_set_merchant ON public.pos_devices;
CREATE TRIGGER pos_devices_set_updated_at
  BEFORE INSERT OR UPDATE ON public.pos_devices
  FOR EACH ROW EXECUTE FUNCTION public.pos_devices_set_updated_at();
