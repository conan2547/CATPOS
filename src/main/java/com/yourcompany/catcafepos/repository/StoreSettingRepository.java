package com.yourcompany.catcafepos.repository;

import com.yourcompany.catcafepos.model.StoreSetting;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * จัดการข้อมูลการตั้งค่าร้านในฐานข้อมูล
 */
public interface StoreSettingRepository extends JpaRepository<StoreSetting, Long> {}
