import "./PageHeader.css";

export default function PageHeader({ title, description, actions }) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header__copy">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>

      {actions && <div className="ui-page-header__actions">{actions}</div>}
    </div>
  );
}
