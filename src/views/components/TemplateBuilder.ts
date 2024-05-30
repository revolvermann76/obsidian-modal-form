import { A, pipe } from "@std";
import { FormDefinition } from "src/core/formDefinition";
import { derived, writable } from "svelte/store";

// type FieldDefinition = FormDefinition["fields"][number];

interface FieldOption {
    name: string;
    onFrontmatter: boolean;
    onBody: boolean;
    omit: false;
}

interface OmitedFieldOption {
    name: string;
    omit: true;
    // field: FieldDefinition;
}

type Field = FieldOption | OmitedFieldOption;

const Field = (name: string): FieldOption => ({
    name,
    onFrontmatter: false,
    onBody: false,
    omit: false,
});

function compileFrontmatter(fields: FieldOption[]) {
    const frontmatterFields = fields
        .filter((field) => field.onFrontmatter)
        .map((field) => field.name);
    if (frontmatterFields.length === 0) {
        return "";
    }
    if (frontmatterFields.length === fields.length) {
        return `tR += result.asFrontmatterString();`;
    }
    return `tR += result.asFrontmatterString({ pick: ${JSON.stringify(
        frontmatterFields,
        null,
        16,
    )} \t});`;
}

function compileOpenForm(formName: string, fieldsToOmit: string[], usesGlobal: boolean = false) {
    const omitOptions =
        fieldsToOmit.length > 0 ? `, ${JSON.stringify({ omit: fieldsToOmit }, null, 8)}` : "";
    const args = `"${formName}"${omitOptions}`;
    console.log({ args });
    if (usesGlobal) {
        return [`const result = await MF.openForm(${args});`];
    }
    return `
    const modalForm = app.plugins.plugins.modalforms.api;
    const result = await modalForm.openForm(${args});`
        .trim()
        .split("\n")
        .map((x) => x.trim());
}

function compileTemplaterTemplate(formName: string) {
    return ([fields, options]: [Field[], { includeFences: boolean }]) => {
        const fieldsToInclude = fields.filter((field): field is FieldOption => !field.omit);
        const fieldsToOmit = fields.filter((field): field is OmitedFieldOption => field.omit);
        const openTheform = compileOpenForm(
            formName,
            fieldsToOmit.map((x) => x.name),
        ).join("\n  ");
        console.log(openTheform);

        return [
            options.includeFences ? `<% "---" %>` : "",
            `<%*`,
            `  ${openTheform}`,
            `  ${compileFrontmatter(fieldsToInclude)}`,
            `-%>`,
            options.includeFences ? `<% "---" -%>` : "",
        ].join("\n");
    };
}

export const makeModel = (formDefinition: FormDefinition) => {
    const fields = writable(
        formDefinition.fields.reduce((acc, { name }) => [...acc, Field(name)], [] as Field[]),
    );
    const options = writable({ includeFences: true });

    const code = derived([fields, options], compileTemplaterTemplate(formDefinition.name));

    function setField(name: string, newValues: Partial<Field>) {
        console.log({ name, newValues });
        fields.update(($fields) =>
            pipe(
                $fields,
                A.updateFirst(
                    (f) => f.name === name,
                    (f) => {
                        return { ...f, ...newValues } as Field;
                    },
                ),
            ),
        );
    }
    function toggleAllFrontmatter(value: boolean) {
        fields.update(($fields) =>
            $fields.map((f) => {
                if (f.omit) {
                    return f;
                }
                return { ...f, onFrontmatter: value };
            }),
        );
    }
    function omitField(name: string, value: boolean) {
        setField(name, { omit: value } as Field);
    }
    return { fields, setField, code, omitField, toggleAllFrontmatter, options };
};

export type TemplateBuilderModel = ReturnType<typeof makeModel>;
