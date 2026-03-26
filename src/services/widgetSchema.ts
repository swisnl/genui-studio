// JSON schema describing all widget types for the AI agent system prompt
export const widgetSchema = {
  description: 'Schema for GenUI widget templates. A widget template is a JSON tree of nodes. All props are FLAT on the node — never nested under "props".',
  types: {
    // Layout containers
    Box: {
      description: 'Flexible container. Becomes a flex container when direction, align, justify, or gap is set.',
      props: {
        direction: { type: 'string', enum: ['row', 'col', 'row-reverse', 'col-reverse'] },
        align: { type: 'string', enum: ['start', 'end', 'center', 'baseline', 'stretch'], description: 'Maps to align-items' },
        justify: { type: 'string', enum: ['start', 'end', 'center', 'between', 'around', 'evenly'], description: 'Maps to justify-content' },
        wrap: { type: 'string', enum: ['wrap', 'nowrap', 'reverse'] },
        gap: { type: 'number', description: 'SpacingSize. Controls spacing between children. 4 = 1rem, 8 = 2rem' },
        flex: { type: 'string|number', description: '"1" to grow, "auto", "none"' },
        width: { type: 'string|number', description: 'CSS width. Numbers become px.' },
        height: { type: 'string|number', description: 'CSS height. Numbers become px.' },
        padding: { type: 'number|object', description: 'SpacingSize or {x, y, top, right, bottom, left}. 4 = 1rem, 8 = 2rem' },
        margin: { type: 'number', description: 'SpacingSize' },
        background: { type: 'string', description: 'Surface token: "surface", "surface-secondary", "surface-tertiary", "surface-elevated", or semantic: "success", "danger", "warning", "info"' },
        border: { type: 'boolean|object', description: 'true for 1px solid border, or {size, style, color}' },
        radius: { type: 'string', enum: ['none', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', 'full'] },
        onClickAction: { type: 'WidgetAction' },
      },
      children: true,
    },
    Row: {
      description: 'Box with direction=row and align=center by default. Use for horizontal layouts.',
      props: {
        gap: { type: 'number', description: 'SpacingSize between children', default: 2 },
        align: { type: 'string', enum: ['start', 'end', 'center', 'baseline', 'stretch'] },
        justify: { type: 'string', enum: ['start', 'end', 'center', 'between', 'around', 'evenly'] },
        wrap: { type: 'string', enum: ['wrap', 'nowrap'] },
        padding: { type: 'number|object' },
        flex: { type: 'string|number' },
        width: { type: 'string|number' },
        height: { type: 'string|number' },
        background: { type: 'string' },
        border: { type: 'boolean|object' },
        radius: { type: 'string' },
      },
      children: true,
    },
    Col: {
      description: 'Box with direction=col. Use for vertical stacking.',
      props: {
        gap: { type: 'number', description: 'SpacingSize between children', default: 2 },
        align: { type: 'string', enum: ['start', 'end', 'center', 'baseline', 'stretch'] },
        justify: { type: 'string', enum: ['start', 'end', 'center', 'between', 'around', 'evenly'] },
        padding: { type: 'number|object' },
        flex: { type: 'string|number' },
        width: { type: 'string|number' },
        height: { type: 'string|number' },
        background: { type: 'string' },
        border: { type: 'boolean|object' },
        radius: { type: 'string' },
      },
      children: true,
    },
    Card: {
      description: 'Bordered container with padding and rounded corners. Has a fixed width based on size.',
      props: {
        size: { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'md', description: 'Width: xs=16rem, sm=22.5rem, md=26.25rem, lg=32rem, xl=40rem' },
        padding: { type: 'number', default: 4 },
        background: { type: 'string', default: 'var(--genui-color-background)' },
        radius: { type: 'string', default: '3xl' },
        confirm: { type: 'CardAction' },
        cancel: { type: 'CardAction' },
      },
      children: true,
    },

    // Text
    Text: {
      props: {
        value: { type: 'string', required: true },
        size: { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'md', description: 'xs=.75rem, sm=.875rem, md=1rem, lg=1.125rem, xl=1.25rem' },
        weight: { type: 'string', enum: ['normal', 'medium', 'semibold', 'bold'], default: 'normal' },
        color: { type: 'string', default: 'prose', description: 'Text color token: "prose", "primary", "secondary", "tertiary", "success", "danger", "warning"' },
        textAlign: { type: 'string', enum: ['start', 'center', 'end', 'justify'] },
        truncate: { type: 'boolean', description: 'Single-line ellipsis' },
        maxLines: { type: 'number', description: 'Multi-line clamp' },
      },
    },
    Title: {
      props: {
        value: { type: 'string', required: true },
        size: { type: 'string', enum: ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'], default: 'md', description: 'sm=1.125rem, md=1.25rem, lg=1.5rem, xl=1.875rem, 2xl=2.25rem' },
        weight: { type: 'string', enum: ['normal', 'medium', 'semibold', 'bold'], default: 'medium' },
        color: { type: 'string', default: 'prose' },
        textAlign: { type: 'string', enum: ['start', 'center', 'end'] },
        truncate: { type: 'boolean' },
      },
    },
    Label: {
      description: 'Form field label. Renders as <label> element.',
      props: {
        value: { type: 'string', required: true },
        fieldName: { type: 'string', required: true, description: 'Must match the name prop of the associated input' },
        size: { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'sm' },
        weight: { type: 'string', default: 'medium' },
        color: { type: 'string', default: 'secondary' },
      },
    },
    Caption: {
      description: 'Small helper/secondary text.',
      props: {
        value: { type: 'string', required: true },
        size: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'md', description: 'sm=.625rem, md=.75rem, lg=.875rem' },
        weight: { type: 'string', enum: ['normal', 'medium', 'semibold', 'bold'] },
        color: { type: 'string', default: 'secondary' },
        truncate: { type: 'boolean' },
      },
    },
    Markdown: { props: { value: { type: 'string', required: true, description: 'Markdown content' } } },

    // Form inputs
    Input: {
      props: {
        name: { type: 'string', description: 'Field name (used for form submission)' },
        placeholder: { type: 'string' },
        inputType: { type: 'string', default: 'text', description: '"text", "email", "password", "number", "tel", "url"' },
        variant: { type: 'string', enum: ['outline', 'soft'], default: 'outline' },
        size: { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl'], default: 'md' },
        required: { type: 'boolean' },
        disabled: { type: 'boolean' },
      },
    },
    Textarea: {
      props: {
        name: { type: 'string' },
        placeholder: { type: 'string' },
        rows: { type: 'number', default: 3 },
        variant: { type: 'string', enum: ['outline', 'soft'], default: 'outline' },
        size: { type: 'string', default: 'md' },
        required: { type: 'boolean' },
        disabled: { type: 'boolean' },
      },
    },
    Select: {
      props: {
        options: { type: 'WidgetOption[]', required: true },
        name: { type: 'string' },
        placeholder: { type: 'string' },
        variant: { type: 'string', enum: ['solid', 'soft', 'outline', 'ghost'], default: 'outline' },
        size: { type: 'string', default: 'md' },
        block: { type: 'boolean', description: 'Full width' },
        clearable: { type: 'boolean' },
        disabled: { type: 'boolean' },
        onChangeAction: { type: 'WidgetAction' },
      },
    },
    Checkbox: {
      props: {
        label: { type: 'string' },
        name: { type: 'string' },
        disabled: { type: 'boolean' },
        onChangeAction: { type: 'WidgetAction' },
      },
    },
    RadioGroup: {
      props: {
        options: { type: 'WidgetOption[]', required: true },
        name: { type: 'string' },
        direction: { type: 'string', enum: ['row', 'col'], default: 'row' },
        disabled: { type: 'boolean' },
        onChangeAction: { type: 'WidgetAction' },
      },
    },
    DatePicker: {
      props: {
        name: { type: 'string' },
        placeholder: { type: 'string' },
        variant: { type: 'string', enum: ['solid', 'soft', 'outline', 'ghost'], default: 'outline' },
        size: { type: 'string', default: 'md' },
        disabled: { type: 'boolean' },
        onChangeAction: { type: 'WidgetAction' },
      },
    },

    // Actions
    Button: {
      props: {
        label: { type: 'string', required: true },
        variant: { type: 'string', enum: ['solid', 'soft', 'outline', 'ghost'], default: 'solid' },
        color: { type: 'string', enum: ['primary', 'secondary', 'success', 'danger', 'warning', 'info', 'discovery'], default: 'primary' },
        size: { type: 'string', enum: ['3xs', '2xs', 'xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'], default: 'lg' },
        iconStart: { type: 'string', description: 'Icon name before label' },
        iconEnd: { type: 'string', description: 'Icon name after label' },
        pill: { type: 'boolean', default: true, description: 'Rounded pill shape' },
        uniform: { type: 'boolean', default: true, description: 'Gives the button a 1:1 aspect ratio, great for icon buttons' },
        block: { type: 'boolean', description: 'Full width' },
        disabled: { type: 'boolean' },
        onClickAction: { type: 'WidgetAction' },
      },
    },
    Form: {
      description: 'Form container. Wraps children in a <form> element.',
      props: { onSubmitAction: { type: 'WidgetAction' } },
      children: true,
    },

    // Display
    Image: {
      props: {
        src: { type: 'string', required: true },
        alt: { type: 'string' },
        width: { type: 'string|number', description: 'CSS width. Numbers become px.' },
        height: { type: 'string|number', description: 'CSS height. Numbers become px.' },
        size: { type: 'string|number', description: 'Sets both width and height' },
        aspectRatio: { type: 'string|number', description: 'e.g. "1/1", "16/9"' },
        fit: { type: 'string', enum: ['none', 'cover', 'contain', 'fill', 'scale-down'], default: 'cover' },
        radius: { type: 'string', enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', 'full'], description: 'Border radius. "full" for circular.' },
        frame: { type: 'boolean', description: 'Adds a subtle border frame around the image' },
        flush: { type: 'boolean', description: 'Makes the image flush with the edges of its container' },
      },
    },
    Icon: {
      description: 'Inline icon. Renders as an SVG.',
      props: {
        name: { type: 'string', required: true, description: 'Available: mail, phone, user, profile, profile-card, calendar, chart, search, settings-slider, star, star-filled, check, check-circle, plus, sparkle, sparkle-double, write, globe, bolt, lightbulb, info, book-open, compass, cube, desktop, mobile, document, external-link, map-pin, suitcase, lab, lifesaver, notebook, play, reload, square-code, square-image, square-text, wreath, image, keys, agent, analytics, atom, confetti' },
        size: { type: 'string', enum: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'], default: 'md' },
        color: { type: 'string', description: 'Text color token: "prose", "primary", "secondary", "tertiary", "success", "danger", "warning"' },
      },
    },
    Badge: {
      props: {
        label: { type: 'string', required: true },
        color: { type: 'string', enum: ['secondary', 'success', 'danger', 'warning', 'info', 'discovery'], default: 'secondary' },
        variant: { type: 'string', enum: ['solid', 'soft', 'outline'], default: 'soft' },
        size: { type: 'string', enum: ['sm', 'md', 'lg'], default: 'sm' },
        pill: { type: 'boolean', default: true },
      },
    },
    Divider: {
      description: 'Horizontal line separator.',
      props: {
        color: { type: 'string', enum: ['default', 'subtle', 'strong'] },
        spacing: { type: 'number', description: 'Vertical margin (SpacingSize)' },
      },
    },
    Spacer: {
      description: 'Flexible spacer that grows to fill available space.',
      props: {
        minSize: { type: 'string|number', description: 'Minimum size. Numbers become px.' },
      },
    },
    ListView: { description: 'Vertical list container. Use with ListViewItem children.', props: {}, children: true },
    ListViewItem: {
      description: 'List row. Renders as a horizontal row.',
      props: { onClickAction: { type: 'WidgetAction' } },
      children: true,
    },
  },
  sharedTypes: {
    CardAction: { label: { type: 'string', required: true }, action: { type: 'WidgetAction', required: true} },
    WidgetAction: { type: { type: 'string', required: true }, payload: { type: 'object' }, handling: { type: 'string', enum: ['client', 'server'] } },
    WidgetOption: { label: { type: 'string', required: true }, value: { type: 'string|number|boolean', required: true } },
    SpacingSize: { description: 'Number value. 0|1|2|4|6|8|10|12|16|20|24. Converted to rem: value * 0.25rem (so 4 = 1rem, 8 = 2rem, 16 = 4rem).' },
  },
}

export function getSchemaText(): string {
  return JSON.stringify(widgetSchema, null, 2)
}
