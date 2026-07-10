
CREATE TABLE public.contatos_recorrentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  nome text NOT NULL,
  documento text NOT NULL,
  documento_digits text GENERATED ALWAYS AS (regexp_replace(documento, '[^0-9]', '', 'g')) STORED,
  categoria_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contatos_recorrentes_org_idx ON public.contatos_recorrentes(organization_id);
CREATE INDEX contatos_recorrentes_digits_idx ON public.contatos_recorrentes(documento_digits);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos_recorrentes TO authenticated;
GRANT ALL ON public.contatos_recorrentes TO service_role;

ALTER TABLE public.contatos_recorrentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view contatos"
  ON public.contatos_recorrentes FOR SELECT
  TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can insert contatos"
  ON public.contatos_recorrentes FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can update contatos"
  ON public.contatos_recorrentes FOR UPDATE
  TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()))
  WITH CHECK (organization_id = public.get_user_org_id(auth.uid()));

CREATE POLICY "Org members can delete contatos"
  ON public.contatos_recorrentes FOR DELETE
  TO authenticated
  USING (organization_id = public.get_user_org_id(auth.uid()));

CREATE TRIGGER update_contatos_recorrentes_updated_at
  BEFORE UPDATE ON public.contatos_recorrentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
