import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../components/Button';
import { SearchField } from '../../components/Inputs';
import { AsyncBoundary, EmptyState } from '../../components/StateViews';
import { useAsync } from '../../hooks/useAsync';
import { deleteRow, insertRow, listRows, updateRow, type AdminRow } from '../../data/adminRepository';
import { matchesSearch } from '../../domain/search';
import { errorKey } from '../../lib/errors';
import type { FieldConfig, ResourceConfig } from './resources';
import { useDialog } from '../../hooks/useDialog';
import { initialFormValues, invalidFields, toRowValues, type FormValues } from './formValues';

type Options = Record<string, Array<{ value: string; label: string }>>;

/** Generic list + create/edit/delete screen driven by a ResourceConfig. */
export function CrudPage({ resource }: { resource: ResourceConfig }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<AdminRow | 'new' | null>(null);

  const data = useAsync(async () => {
    const refFields = resource.fields.filter((f) => f.ref);
    const [rows, ...refRows] = await Promise.all([
      listRows(resource.table, resource.order),
      ...refFields.map((f) => listRows(f.ref!.table, f.ref!.order, f.ref!.select)),
    ]);
    const options: Options = {};
    refFields.forEach((f, i) => {
      options[f.name] = refRows[i].map((r) => ({ value: String(r.id), label: f.ref!.label(r) }));
    });
    for (const f of resource.fields) {
      if (f.options) options[f.name] = f.options.map((o) => ({ value: o.value, label: t(o.labelKey) }));
    }
    return { rows, options };
  }, [resource.key]);

  const display = (field: FieldConfig, row: AdminRow, options: Options): string => {
    const v = row[field.name];
    if (field.type === 'checkbox') return v ? '✓' : '';
    if (v == null) return '';
    if (options[field.name]) return options[field.name].find((o) => o.value === String(v))?.label ?? String(v);
    if (field.type === 'time') return String(v).slice(0, 5);
    return String(v);
  };

  const listFields = resource.fields.filter((f) => f.list);
  const pkMatch = (row: AdminRow) => Object.fromEntries(resource.primaryKey.map((k) => [k, row[k]]));

  const remove = async (row: AdminRow) => {
    if (!window.confirm(t('admin.crud.confirmDelete'))) return;
    try {
      await deleteRow(resource.table, pkMatch(row));
      data.reload();
    } catch (e) {
      window.alert(t('admin.crud.deleteFailed', { message: t(errorKey(e)) }));
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__head">
        <h1 className="admin-page__title">{t(`admin.nav.${resource.nav}`)}</h1>
        <Button size="sm" icon={<Plus size={16} aria-hidden />} onClick={() => setEditing('new')}>
          {t('admin.crud.add')}
        </Button>
      </div>

      <AsyncBoundary state={data}>
        {({ rows, options }) => {
          const visible = rows.filter((r) => matchesSearch(listFields.map((f) => display(f, r, options)), query));
          return (
            <>
              <div className="admin-toolbar">
                <SearchField value={query} onChange={setQuery} placeholder={t('admin.crud.filter')} />
                <span className="muted admin-toolbar__count">{t('admin.crud.count', { count: visible.length })}</span>
              </div>
              {visible.length === 0 ? (
                <EmptyState>{t('admin.crud.empty')}</EmptyState>
              ) : (
                <div className="table-scroll">
                  <table className="table admin-table">
                    <thead>
                      <tr>
                        {listFields.map((f) => (
                          <th key={f.name} scope="col">
                            {t(`admin.fields.${f.label}`)}
                          </th>
                        ))}
                        <th scope="col" className="admin-table__actions">
                          <span className="visually-hidden">{t('common.edit')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((row) => (
                        <tr key={resource.primaryKey.map((k) => String(row[k])).join(':')}>
                          {listFields.map((f) => (
                            <td key={f.name} className={f.type === 'number' ? 'table__num num' : undefined}>
                              {display(f, row, options)}
                            </td>
                          ))}
                          <td className="admin-table__actions">
                            {resource.detailPath && (
                              <Link to={resource.detailPath(row)} className="icon-btn" aria-label={t('admin.match.open')}>
                                <ChevronRight size={18} aria-hidden />
                              </Link>
                            )}
                            {resource.editable !== false && (
                              <button type="button" className="icon-btn" onClick={() => setEditing(row)} aria-label={t('common.edit')}>
                                <Pencil size={16} aria-hidden />
                              </button>
                            )}
                            <button type="button" className="icon-btn icon-btn--danger" onClick={() => void remove(row)} aria-label={t('common.delete')}>
                              <Trash2 size={16} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {editing && (
                <RecordForm
                  resource={resource}
                  row={editing === 'new' ? null : editing}
                  options={options}
                  onClose={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null);
                    data.reload();
                  }}
                  pkMatch={pkMatch}
                />
              )}
            </>
          );
        }}
      </AsyncBoundary>
    </div>
  );
}

function RecordForm({
  resource,
  row,
  options,
  onClose,
  onSaved,
  pkMatch,
}: {
  resource: ResourceConfig;
  row: AdminRow | null;
  options: Options;
  onClose: () => void;
  onSaved: () => void;
  pkMatch: (row: AdminRow) => AdminRow;
}) {
  const { t } = useTranslation();
  const fields = useMemo(() => resource.fields.filter((f) => !f.readOnly && !(row && f.createOnly)), [resource.fields, row]);
  const [values, setValues] = useState<FormValues>(() => initialFormValues(fields, row));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const invalid = useMemo(() => invalidFields(fields, values), [fields, values]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid.length > 0) return;
    setSaving(true);
    setError(null);
    try {
      const payload = toRowValues(fields, values);
      if (row) await updateRow(resource.table, pkMatch(row), payload);
      else if (resource.create) await resource.create(payload);
      else await insertRow(resource.table, payload);
      onSaved();
    } catch (err) {
      setError(t('admin.crud.saveFailed', { message: t(errorKey(err)) }));
    } finally {
      setSaving(false);
    }
  };

  const set = (name: string, v: string | boolean) => setValues((prev) => ({ ...prev, [name]: v }));
  const dialogRef = useDialog<HTMLDivElement>(true, onClose);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="record-form-title" ref={dialogRef}>
      <div className="sheet__backdrop" onClick={onClose} />
      <form className="sheet__panel" onSubmit={submit} noValidate>
        <div className="sheet__head">
          <h2 id="record-form-title" className="sheet__title">
            {row ? t('admin.crud.editItem') : t('admin.crud.newItem')}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="sheet__body">
          {fields.map((f) => {
            const id = `field-${f.name}`;
            const bad = touched && invalid.includes(f.name);
            if (f.type === 'checkbox') {
              return (
                <label key={f.name} className="checkbox-field" htmlFor={id}>
                  <input id={id} type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => set(f.name, e.target.checked)} />
                  <span>{t(`admin.fields.${f.label}`)}</span>
                </label>
              );
            }
            return (
              <label key={f.name} className="field" htmlFor={id}>
                <span className="field__label">
                  {t(`admin.fields.${f.label}`)}
                  {f.required && ' *'}
                </span>
                {f.type === 'select' ? (
                  <select
                    id={id}
                    className={`field__control${bad ? ' field__control--invalid' : ''}`}
                    value={String(values[f.name])}
                    onChange={(e) => set(f.name, e.target.value)}
                  >
                    <option value="">{t('admin.crud.select')}</option>
                    {(options[f.name] ?? []).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={id}
                    className={`field__control${bad ? ' field__control--invalid' : ''}`}
                    type={f.type}
                    inputMode={f.type === 'number' ? 'numeric' : undefined}
                    value={String(values[f.name])}
                    onChange={(e) => set(f.name, e.target.value)}
                  />
                )}
              </label>
            );
          })}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="sheet__foot">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
