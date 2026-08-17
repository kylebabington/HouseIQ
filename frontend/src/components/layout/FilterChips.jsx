function FilterChips({
  options,
  value,
  onChange,
  ariaLabel,
}) {
  return (
    <div
      className="filter-chips"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          className={
            value === option.id
              ? "filter-chip active"
              : "filter-chip"
          }
          onClick={() => onChange(option.id)}
        >
          {option.label}
          {option.count != null ? (
            <span>{option.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

export default FilterChips;
