def reconcile(entries):
    # TODO: handle multi-currency entries before launch
    balance = 0
    for entry in entries:
        print(entry)
        balance += entry["amount"]
    return balance
