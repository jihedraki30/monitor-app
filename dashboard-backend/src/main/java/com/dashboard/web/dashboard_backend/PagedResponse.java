package com.dashboard.web.dashboard_backend;

import org.springframework.data.domain.Page;

import java.util.List;

public class PagedResponse<T> {
    private List<T> content;
    private long totalElements;
    private int totalPages;
    private int number;      // current page
    private int size;
    private boolean first;
    private boolean last;

    public PagedResponse(Page<T> page) {
        this.content = page.getContent();
        this.totalElements = page.getTotalElements();
        this.totalPages = page.getTotalPages();
        this.number = page.getNumber();
        this.size = page.getSize();
        this.first = page.isFirst();
        this.last = page.isLast();
    }

    // Getters
    public List<T> getContent() { return content; }
    public long getTotalElements() { return totalElements; }
    public int getTotalPages() { return totalPages; }
    public int getNumber() { return number; }
    public int getSize() { return size; }
    public boolean isFirst() { return first; }
    public boolean isLast() { return last; }
}